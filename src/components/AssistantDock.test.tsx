// @vitest-environment jsdom
/**
 * The assistant dock, driven through its real controls.
 *
 * What matters here: which engine is named on screen, that a signed-in person gets the
 * server path while everyone else gets the labelled browser one, that a failure is shown
 * rather than swallowed, and that requesting mentorship from an answer carries the mentor
 * the engine chose and the question that produced it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssistantDock } from './AssistantDock.tsx';
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

const OFFLINE: Session = {
  status: 'error',
  error: {
    kind: 'network',
    status: 0,
    message: 'Could not reach the server.',
    userMessage: 'Could not reach the server.',
  } as never,
};

const ANSWER = {
  ok: true,
  reply: 'Reduce it to one failing request, then bring that to Dana.',
  followUps: ['What have you already tried?'],
  mentors: [
    {
      id: 'm-1',
      name: 'Dana Reyes',
      headline: 'Staff Engineer at Acme',
      expertise: ['Kafka', 'Postgres'],
      score: 87,
      summary: 'Dana works on queues and Kafka.',
    },
  ],
  engine: 'gemini' as const,
  cached: false,
  considered: 4,
  note: 'The mentors below were ranked by the matching engine before this answer was written.',
};

let calls: string[];
let routes: Record<string, { status?: number; body: unknown }>;

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    calls.push(`${init?.method ?? 'GET'} ${path}`);
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

const renderDock = (session: Session = READY) => {
  const onRequestMentor = vi.fn();
  const onBrowseMentors = vi.fn();
  render(<AssistantDock session={session} onRequestMentor={onRequestMentor} onBrowseMentors={onBrowseMentors} />);
  return { onRequestMentor, onBrowseMentors };
};

const ask = (question: string) => {
  fireEvent.click(screen.getByRole('button', { name: /ask the assistant/i }));
  fireEvent.change(screen.getByLabelText(/your question/i), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: /send question/i }));
};

describe('the assistant dock', () => {
  it('opens and closes', () => {
    renderDock();
    expect(screen.queryByRole('dialog', { name: /assistant/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ask the assistant/i }));
    expect(screen.getByRole('dialog', { name: /assistant/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /close the assistant/i }));
    expect(screen.queryByRole('dialog', { name: /assistant/i })).toBeNull();
  });

  it('sends the question to the server and names the model when there is a session', async () => {
    routes['/api/assistant/chat'] = { body: ANSWER };
    renderDock();

    ask('Why does my queue duplicate charges?');

    expect(await screen.findByText(/Reduce it to one failing request/)).toBeTruthy();
    expect(screen.getByText(/Written by Gemini/)).toBeTruthy();
    expect(screen.getByText('Dana Reyes')).toBeTruthy();
    expect(screen.getByText('87/100 fit')).toBeTruthy();
    expect(screen.getByText(/ranked by the matching engine before this answer was written/)).toBeTruthy();
    expect(calls).toEqual(['POST /api/assistant/chat']);
  });

  it('carries the engine’s mentor and the question into a mentorship request', async () => {
    routes['/api/assistant/chat'] = { body: ANSWER };
    const { onRequestMentor } = renderDock();

    ask('Why does my queue duplicate charges?');
    fireEvent.click(await screen.findByRole('button', { name: /request mentorship from Dana Reyes/i }));

    expect(onRequestMentor).toHaveBeenCalledTimes(1);
    const [mentor, topic] = onRequestMentor.mock.calls[0]!;
    expect(mentor.id).toBe('m-1');
    expect(topic).toBe('Why does my queue duplicate charges?');
  });

  it('answers in the browser, labelled, when the server cannot be reached', async () => {
    renderDock(OFFLINE);

    ask('My Kafka consumer keeps reprocessing an offset');

    expect(await screen.findByText(/Demo engine: computed in your browser/)).toBeTruthy();
    expect(screen.queryByText(/Written by Gemini/)).toBeNull();
    // The question is answered (once as the question, once quoted in the answer), and the
    // note as well as the mentor's own line say where the mentor came from.
    expect(screen.getAllByText(/Kafka consumer keeps reprocessing/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/keyword overlap/i).length).toBeGreaterThanOrEqual(1);
    // Nothing was sent anywhere.
    expect(calls).toEqual([]);
  });

  it('shows a failure with a retry rather than an empty reply', async () => {
    routes['/api/assistant/chat'] = {
      status: 503,
      body: { ok: false, error: 'No AI provider key is configured.', code: 'ai_unconfigured', requiredEnv: ['AI_API_KEY'] },
    };
    renderDock();

    ask('Why does my queue duplicate charges?');

    expect(await screen.findByText(/That did not work/)).toBeTruthy();
    expect(screen.getByText(/AI_API_KEY/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(screen.queryByText(/Written by Gemini/)).toBeNull();
  });

  it('offers the directory to browse from the panel', () => {
    const { onBrowseMentors } = renderDock();
    fireEvent.click(screen.getByRole('button', { name: /ask the assistant/i }));
    fireEvent.click(screen.getByRole('button', { name: /browse all mentors/i }));
    expect(onBrowseMentors).toHaveBeenCalledTimes(1);
  });
});
