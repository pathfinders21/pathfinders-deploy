// @vitest-environment jsdom
/**
 * The agent screen: what the student sees, and what they can do about it.
 *
 * The backend is stubbed. These tests pin the human-in-the-loop properties at the
 * interface: a proposal is shown with its reasoning and evidence before anything is
 * applied, applying reports what actually changed, and a failure offers a retry instead
 * of a success message.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentPanel } from './AgentPanel.tsx';
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
    goalsText: 'Become a backend engineer',
    projectText: '',
    skillsHave: [],
    skillsWant: [],
    interests: [],
    industries: [],
    hoursPerWeek: '6',
    completion: 60,
  },
};

const PROPOSAL = {
  id: 'p1',
  createdAt: '2026-10-12T10:00:00.000Z',
  engine: 'gemini' as const,
  status: 'pending' as const,
  triggerKind: 'overdue_milestone',
  triggerRef: 's1',
  actionKind: 'save_action_item' as const,
  title: 'Block an hour for the indexing milestone',
  detail: 'Spend an hour on it and write down what blocked you.',
  reasoning: 'The most overdue item is the one most likely to be abandoned quietly.',
  evidence: [{ ref: 'overdue' as const, detail: '"Learn Postgres indexing" was due 3 days ago.' }],
  milestoneRef: '',
  estimate: '1 hour',
  deadline: '',
  confidence: 0.6,
  mentorId: '',
  decidedAt: null,
  executedAt: null,
  result: null,
};

const VIEW = {
  ok: true as const,
  proposals: [PROPOSAL],
  findings: [{ kind: 'overdue_milestone', ref: 's1', detail: '"Learn Postgres indexing" was due 3 days ago.' }],
  state: { goalTitle: 'Become a backend engineer', hasRoadmap: true, doneCount: 2, totalCount: 5, overdueCount: 1, stalledCount: 0 },
  note: 'Proposed by a model from your stored profile and roadmap.',
};

let routes: Array<{ match: (path: string, method: string) => boolean; reply: () => Response }>;
let calls: string[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  routes = [
    { match: (p, m) => p === '/api/agent' && m === 'GET', reply: () => json(VIEW) },
  ];
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const route = routes.find((r) => r.match(path, method));
    return route ? route.reply() : json({ ok: false, error: 'not stubbed' }, 404);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AgentPanel', () => {
  it('asks for a sign in rather than inventing an owner', () => {
    render(<AgentPanel session={{ status: 'signed_out' }} />);
    expect(screen.getByText(/sign in to use the agent/i)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('shows the real state and a pending proposal with its reasoning and evidence', async () => {
    render(<AgentPanel session={READY} />);
    expect(await screen.findByText(/Block an hour for the indexing milestone/)).toBeTruthy();
    expect(screen.getByText(/Why this action/)).toBeTruthy();
    expect(screen.getByText(/The most overdue item is the one most likely/)).toBeTruthy();
    expect(screen.getByText(/Evidence it rests on/)).toBeTruthy();
    expect(screen.getByText(/was due 3 days ago/)).toBeTruthy();
    expect(screen.getByText(/Proposed by the model/)).toBeTruthy();
    expect(screen.getByText('2/5')).toBeTruthy();
    // The decision has not been made, so the controls are there and nothing is applied.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reject/i })).toBeTruthy();
  });

  it('proposes an action on request and shows that it is inert until approved', async () => {
    routes.push({
      match: (p, m) => p === '/api/agent/propose' && m === 'POST',
      reply: () => json({ ok: true, proposal: PROPOSAL, reused: false, findings: VIEW.findings, note: 'n' }),
    });
    render(<AgentPanel session={READY} />);
    await screen.findByText(/Block an hour/);
    fireEvent.click(screen.getByRole('button', { name: /propose a next action/i }));
    expect(await screen.findByText(/Block an hour for the indexing milestone/)).toBeTruthy();
    expect(calls).toContain('POST /api/agent/propose');
  });

  it('reports exactly what changed after approval', async () => {
    routes.push({
      match: (p) => p.includes('/decision'),
      reply: () =>
        json({
          ok: true,
          proposal: { ...PROPOSAL, status: 'approved', executedAt: '2026-10-12T11:00:00.000Z', result: 'Applied.' },
          executed: true,
          changed: ['Added a new task to your active roadmap: "Block an hour for the indexing milestone".'],
          message: 'Applied.',
        }),
    });
    render(<AgentPanel session={READY} />);
    fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }));

    expect(await screen.findByText(/Added a new task to your active roadmap/)).toBeTruthy();
    expect(calls.some((c) => c.includes('/decision'))).toBe(true);
  });

  it('lets an edit be approved instead of the original wording', async () => {
    routes.push({
      match: (p) => p.includes('/decision'),
      reply: () => json({ ok: true, proposal: { ...PROPOSAL, status: 'approved' }, executed: true, changed: ['Updated.'], message: 'Applied.' }),
    });
    render(<AgentPanel session={READY} />);
    await screen.findByText(/Block an hour/);

    fireEvent.click(screen.getByRole('button', { name: /edit first/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rewrite the indexing notes' } });
    fireEvent.click(screen.getByRole('button', { name: /approve the edit/i }));

    expect(await screen.findByText(/Applied|Updated/)).toBeTruthy();
  });

  it('surfaces a refusal with a retry and says nothing on the roadmap changed', async () => {
    routes.push({
      match: (p, m) => p === '/api/agent/propose' && m === 'POST',
      reply: () =>
        json(
          {
            ok: false,
            error: 'The proposed action was refused by the app rules (That milestone is not in your roadmap). Nothing was saved.',
            code: 'ai_invalid_output',
            retryable: false,
          },
          502,
        ),
    });
    render(<AgentPanel session={READY} />);
    await screen.findByText(/Block an hour/);
    fireEvent.click(screen.getByRole('button', { name: /propose a next action/i }));

    expect(await screen.findByText(/That did not work/)).toBeTruthy();
    expect(screen.getByText(/refused by the app rules/)).toBeTruthy();
    expect(screen.getByText(/Nothing on your roadmap was changed/)).toBeTruthy();
    // Not retryable, so no retry button is offered for a refusal.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('keeps a rejected proposal in the history instead of deleting it', async () => {
    routes[0]!.reply = () =>
      json({
        ...VIEW,
        proposals: [
          { ...PROPOSAL, status: 'rejected', result: 'Rejected: not this week' },
        ],
      });
    render(<AgentPanel session={READY} />);
    expect(await screen.findByText(/History, kept rather than deleted/)).toBeTruthy();
    expect(screen.getByText(/Rejected: not this week/)).toBeTruthy();
    expect(screen.getByText(/Waiting for your decision/i)).toBeTruthy();
  });
});
