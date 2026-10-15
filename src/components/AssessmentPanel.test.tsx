// @vitest-environment jsdom
/**
 * The assessment screen, driven through its real controls with the backend stubbed.
 *
 * These tests exist to pin the honesty rules at the point a person meets them: a thin
 * profile is answered with questions rather than invented findings, a failure says so
 * and offers a retry, and a deterministic result is labelled as one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssessmentPanel } from './AssessmentPanel.tsx';
import type { Session } from '../lib/session.ts';

const READY: Session = {
  status: 'ready',
  role: 'mentee',
  roleChosen: true,
  completion: 60,
  onboardingComplete: true,
  isMentor: false,
  profile: {
    userId: 'u1',
    role: 'mentee',
    displayName: 'Avik',
    email: 'a@example.com',
    goalsText: 'Become a backend engineer on payments systems.',
    projectText: '',
    skillsHave: ['TypeScript'],
    skillsWant: ['Kafka'],
    interests: [],
    industries: [],
    hoursPerWeek: '6',
    completion: 60,
  },
};

/** No server at all: the published build is static and this preview has no Worker. */
const OFFLINE: Session = {
  status: 'error',
  error: {
    kind: 'network',
    status: 0,
    message: 'Could not reach the server.',
    userMessage: 'Could not reach the server.',
  } as never,
};

const ASSESSMENT = {
  id: 'a1',
  createdAt: '2026-10-12T10:00:00.000Z',
  engine: 'gemini' as const,
  provisional: false,
  downgraded: 0,
  targetRole: 'Backend Engineer',
  summary: 'You have shipped a typed API and you are missing the data layer.',
  strengths: [
    { skill: 'TypeScript', evidence: 'You listed it and described a typed API.', confidence: 0.7, source: 'evidenced' as const },
  ],
  gaps: [
    {
      skill: 'Database indexing',
      why: 'Payments work involves query performance.',
      evidence: 'Nothing in your profile mentions a database.',
      priority: 'high' as const,
      confidence: 0.6,
      exercises: ['Add an index to a slow query and measure it.'],
    },
  ],
  assumptions: ['Assumes the project you described is your own.'],
  questionsToStrengthen: ['What does your slowest query look like?'],
};

let routes: Record<string, unknown>;
let calls: string[];

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (!(path in routes)) return new Response(JSON.stringify({ ok: false, error: 'not stubbed' }), { status: 404 });
    const entry = routes[path] as { status?: number; body: unknown };
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

describe('AssessmentPanel', () => {
  it('asks for a sign in instead of inventing a user', () => {
    render(<AssessmentPanel session={{ status: 'signed_out' }} />);
    expect(screen.getByText(/sign in to run an assessment/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /sign in to continue/i })).toBeTruthy();
    // Nothing is fetched when there is no session.
    expect(calls).toEqual([]);
  });

  it('states the failure plainly, and offers the working screen instead of a dead end', () => {
    render(<AssessmentPanel session={OFFLINE} />);

    // The failure is still said out loud, in the server's own words.
    expect(screen.getByText(/the backend is not answering/i)).toBeTruthy();
    expect(screen.getByText(/Could not reach the server\./)).toBeTruthy();
    expect(screen.getByText(/No model is involved/)).toBeTruthy();
    // And it is usable: the form is there, and nothing has been sent anywhere.
    expect(screen.getByPlaceholderText(/I want to move from frontend work/i)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('produces a labelled demo result in the browser when there is no backend', async () => {
    render(<AssessmentPanel session={OFFLINE} />);

    fireEvent.change(screen.getByPlaceholderText(/I want to move from frontend work/i), {
      target: { value: 'Move from frontend work into backend engineering on payments systems' },
    });
    fireEvent.change(screen.getByPlaceholderText(/TypeScript, React, SQL/), {
      target: { value: 'TypeScript, React, SQL' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Database tuning, Kafka/), {
      target: { value: 'Kafka, Postgres indexing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse my gaps/i }));

    // A real result, from the same deterministic rules the server falls back to.
    expect(await screen.findByText(/Demo engine: computed in your browser/)).toBeTruthy();
    expect(screen.getByText(/^What is missing \(/)).toBeTruthy();
    expect(screen.getByText('Kafka')).toBeTruthy();
    expect(screen.getByText(/^What you can already use \(/)).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    // Nothing was sent, nothing is called model output, and the result says it was not stored.
    expect(calls).toEqual([]);
    expect(screen.queryByText(/Generated by the model/)).toBeNull();
    expect(screen.getByText(/nothing was saved/i)).toBeTruthy();
  });

  it('answers a thin profile with the fields that would unblock it', async () => {
    routes['/api/assessment'] = {
      body: {
        ok: true,
        needsMoreInfo: true,
        missing: ['the direction or role you are aiming at, in your own words'],
        improvements: ['how many hours a week you can realistically give this'],
      },
    };
    render(<AssessmentPanel session={READY} />);
    expect(await screen.findByText(/not enough to go on yet/i)).toBeTruthy();
    expect(screen.getByText(/the direction or role you are aiming at/i)).toBeTruthy();
    expect(screen.getByText(/how many hours a week/i)).toBeTruthy();
    // No findings were invented to fill the space: the results section is absent.
    expect(screen.queryByText(/^What is missing \(/)).toBeNull();
    expect(screen.queryByText(/^What you can already use \(/)).toBeNull();
  });

  it('renders findings with their evidence, and labels the engine that produced them', async () => {
    routes['/api/assessment'] = { body: { ok: true, needsMoreInfo: false, assessment: ASSESSMENT, note: 'A reading of what you supplied.' } };
    render(<AssessmentPanel session={READY} />);

    expect(await screen.findByText(/Backend Engineer/)).toBeTruthy();
    expect(screen.getByText(/Generated by the model/)).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByText(/Evidenced/)).toBeTruthy();
    expect(screen.getByText(/You listed it and described a typed API/)).toBeTruthy();
    expect(screen.getByText(/Database indexing/)).toBeTruthy();
    expect(screen.getAllByText(/not a probability of success/).length).toBeGreaterThan(0);
    expect(screen.getByText(/A reading of what you supplied/)).toBeTruthy();
  });

  it('labels a deterministic result as the demo engine', async () => {
    routes['/api/assessment'] = {
      body: { ok: true, needsMoreInfo: false, assessment: { ...ASSESSMENT, engine: 'demo' } },
    };
    render(<AssessmentPanel session={READY} />);
    expect(await screen.findByText(/Demo engine: no provider key configured/)).toBeTruthy();
    expect(screen.queryByText(/Generated by the model/)).toBeNull();
  });

  it('shows a real failure with a retry, and says nothing was saved', async () => {
    routes['/api/assessment'] = { body: { ok: true, needsMoreInfo: false, assessment: null } };
    render(<AssessmentPanel session={READY} />);
    await screen.findByText(/No analysis yet/i);

    // Now make the POST fail the way an unconfigured provider does.
    vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
      const path = String(url);
      if (path === '/api/assessment' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ ok: false, error: 'No AI provider key is configured.', code: 'ai_unconfigured', requiredEnv: ['AI_API_KEY'] }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ok: true, needsMoreInfo: false, assessment: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    fireEvent.change(screen.getByPlaceholderText(/I want to move from frontend work/i), {
      target: { value: 'Become a backend engineer on payments systems.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse my gaps/i }));

    expect(await screen.findByText(/That did not work/i)).toBeTruthy();
    expect(screen.getByText(/AI_API_KEY/)).toBeTruthy();
    expect(screen.queryByText(/Backend Engineer/)).toBeNull();
  });

  it('records a complaint about a poor recommendation', async () => {
    routes['/api/assessment'] = { body: { ok: true, needsMoreInfo: false, assessment: ASSESSMENT } };
    routes['/api/feedback'] = { body: { ok: true, recorded: true, note: 'Recorded.' } };
    render(<AssessmentPanel session={READY} />);

    fireEvent.click(await screen.findByRole('button', { name: /report a poor recommendation/i }));

    await waitFor(() => expect(calls).toContain('POST /api/feedback'));
    expect(await screen.findByText(/recorded for a human to look at/i)).toBeTruthy();
  });

  it('makes the missing evidence rule visible when the model overclaimed', async () => {
    routes['/api/assessment'] = {
      body: {
        ok: true,
        needsMoreInfo: false,
        assessment: {
          ...ASSESSMENT,
          provisional: true,
          downgraded: 2,
          strengths: [{ ...ASSESSMENT.strengths[0], source: 'self_reported' }],
        },
      },
    };
    render(<AssessmentPanel session={READY} />);
    expect(await screen.findByText(/Provisional/)).toBeTruthy();
    expect(screen.getByText(/demoted to self reported/)).toBeTruthy();
    expect(screen.getByText(/Self reported/)).toBeTruthy();
  });
});
