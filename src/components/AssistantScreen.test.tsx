// @vitest-environment jsdom
/**
 * `#/assistant`, the chat as a screen rather than a panel.
 *
 * Same conversation component as the dock, so these check the page and not the rules:
 * that it is a real destination, that it reaches the server when there is a session,
 * that it answers in the browser and says so when there is not, and that the mentor a
 * reply offers can still be asked for from here.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssistantScreen } from './AssistantScreen.tsx';
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

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    return new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderScreen = (session: Session = READY) => {
  const onRequestMentor = vi.fn();
  const onBrowseMentors = vi.fn();
  render(<AssistantScreen session={session} onRequestMentor={onRequestMentor} onBrowseMentors={onBrowseMentors} />);
  return { onRequestMentor, onBrowseMentors };
};

const ask = (question: string) => {
  fireEvent.change(screen.getByLabelText(/your question/i), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: /send question/i }));
};

describe('the assistant screen', () => {
  it('is a page of its own with a normal question box', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: /stuck\? describe it/i })).toBeTruthy();
    expect(screen.getByLabelText(/your question/i)).toBeTruthy();
    expect(screen.getByText(/the mentors are ranked by the matching engine/i)).toBeTruthy();
  });

  it('asks the server when there is a session, and labels the model', async () => {
    renderScreen();

    ask('Why does my queue duplicate charges?');

    expect(await screen.findByText(/Reduce it to one failing request/)).toBeTruthy();
    expect(screen.getByText(/Written by Gemini/)).toBeTruthy();
    expect(screen.getByText('Dana Reyes')).toBeTruthy();
    expect(screen.getByText('87/100 fit')).toBeTruthy();
    expect(calls).toEqual(['POST /api/assistant/chat']);
  });

  it('lets the answer be turned into a mentorship request from this screen too', async () => {
    const { onRequestMentor } = renderScreen();

    ask('Why does my queue duplicate charges?');
    fireEvent.click(await screen.findByRole('button', { name: /request mentorship from Dana Reyes/i }));

    expect(onRequestMentor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-1', name: 'Dana Reyes' }),
      'Why does my queue duplicate charges?',
    );
  });

  it('answers in the browser and says so when no server is reachable', async () => {
    renderScreen(OFFLINE);

    ask('My Kafka consumer keeps reprocessing an offset');

    expect(await screen.findByText(/Demo engine: computed in your browser/)).toBeTruthy();
    expect(screen.queryByText(/Written by Gemini/)).toBeNull();
    // Said twice: once in the page intro, once under the composer.
    expect(screen.getAllByText(/nothing is stored/i).length).toBeGreaterThanOrEqual(2);
    expect(calls).toEqual([]);
  });
});
