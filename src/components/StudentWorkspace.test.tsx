// @vitest-environment jsdom
/**
 * The student dashboard.
 *
 * The point of these tests is that nothing on this screen is decorative: progress comes
 * from stored steps, blockers come from stored deadlines, the next action is the agent's
 * own proposal with its evidence, and a section that fails says so instead of guessing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StudentWorkspace } from './StudentWorkspace.tsx';
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
    displayName: 'Avik Sharma',
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

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

const STEP = (over: Record<string, unknown>) => ({
  id: 's1',
  parentId: null,
  position: 0,
  title: 'Ship a typed API',
  detail: '',
  status: 'pending' as const,
  kind: 'milestone' as const,
  origin: 'ai' as const,
  aiGenerated: true,
  source: 'ai',
  estimate: '2 weeks',
  deadline: null,
  createdAt: day(-20),
  updatedAt: day(-20),
  lastTouchedAt: day(-20),
  ...over,
});

const ROUTES: Record<string, unknown> = {
  '/api/profile': {
    ok: true,
    profile: READY.profile,
    role: 'mentee',
    roleChosen: true,
    completion: 80,
    onboardingComplete: true,
  },
  '/api/roadmap': {
    ok: true,
    goal: { id: 'g1', userId: 'u1', title: 'Become a backend engineer', rationale: '', source: 'user', status: 'active', createdAt: day(-20), updatedAt: day(-20) },
    roadmap: {
      id: 'r1',
      goalId: 'g1',
      goalTitle: 'Become a backend engineer',
      title: 'Backend foundations',
      rationale: '',
      status: 'active',
      revision: 1,
      createdAt: day(-20),
      updatedAt: day(-2),
      steps: [STEP({ id: 's1', status: 'done' }), STEP({ id: 's2', title: 'Add a queue', deadline: day(-2) }), STEP({ id: 's3', title: 'Write a design doc' })],
      stats: { total: 3, done: 1, percent: 33, milestones: 3, milestonesDone: 1, overdue: 1, nextDeadline: day(-2) },
    },
    goals: [],
    events: [],
  },
  '/api/agent': {
    ok: true,
    proposals: [
      {
        id: 'p1',
        createdAt: day(0),
        engine: 'gemini',
        status: 'pending',
        triggerKind: 'overdue_milestone',
        triggerRef: 's2',
        actionKind: 'update_milestone',
        title: 'Move the queue milestone to next week',
        detail: 'It is two days past its date.',
        reasoning: 'The stored deadline has passed.',
        evidence: [{ ref: 'overdue', detail: '“Add a queue” was due 2 days ago.' }],
        milestoneRef: 's2',
        estimate: '',
        deadline: '',
        confidence: 0.7,
        mentorId: '',
        decidedAt: null,
        executedAt: null,
        result: null,
      },
      {
        id: 'p0',
        createdAt: day(-1),
        engine: 'gemini',
        status: 'approved',
        triggerKind: 'stalled',
        triggerRef: 's3',
        actionKind: 'create_milestone',
        title: 'Add a checkpoint',
        detail: '',
        reasoning: '',
        evidence: [],
        milestoneRef: '',
        estimate: '',
        deadline: '',
        confidence: 0.6,
        mentorId: '',
        decidedAt: day(-1),
        executedAt: day(-1),
        result: 'Added to your roadmap.',
      },
    ],
    findings: [{ kind: 'overdue', ref: 's2', detail: '“Add a queue” was due 2 days ago.' }],
    state: { goalTitle: 'Become a backend engineer', hasRoadmap: true, doneCount: 1, totalCount: 3, overdueCount: 1, stalledCount: 0 },
    note: 'Read from your stored roadmap.',
  },
  '/api/matches': {
    ok: true,
    matches: [
      {
        mentor: { id: 'm1', name: 'Priya Raman', headline: 'Payments', expertise: ['Kafka'], interests: [], careers: [], industries: [], mentorGoals: [], availability: [], mentoringStyle: '', bio: '', sessions: null, rating: null, active: true, ready: true, missing: [], verification: 'unverified', account: true },
        score: 78,
        confidence: 'medium',
        factors: [],
        missing: [],
        overlaps: { goals: [], skills: [], interests: [], days: [], industries: [] },
        explanation: { headline: '', summary: 'Covers Kafka.', caveats: ['No session history yet'] },
        summary: 'Covers Kafka.',
        phrasedBy: 'demo',
      },
    ],
    excluded: {},
    excludedReasonText: [],
    note: '',
    weights: {},
    weightsNote: '',
    disclaimer: '',
    goalsConsidered: 'Become a backend engineer',
    candidatePool: 1,
    engine: 'demo',
    profile: READY.profile,
  },
  '/api/assessment': {
    ok: true,
    needsMoreInfo: false,
    assessment: {
      id: 'a1',
      createdAt: day(-3),
      engine: 'gemini',
      provisional: false,
      downgraded: 0,
      targetRole: 'Backend Engineer',
      summary: '',
      strengths: [{ skill: 'TypeScript', evidence: 'You listed it.', confidence: 0.6, source: 'evidenced' }],
      gaps: [
        { skill: 'Database indexing', why: 'Query performance.', evidence: 'Nothing mentions a database.', priority: 'high', confidence: 0.6, exercises: [] },
      ],
      assumptions: [],
      questionsToStrengthen: [],
    },
    readiness: { ready: true, provisional: false, missing: [], improvements: [] },
  },
};

let routes: Record<string, { status?: number; body: unknown }>;
let calls: string[];

beforeEach(() => {
  calls = [];
  routes = Object.fromEntries(Object.entries(ROUTES).map(([path, body]) => [path, { body }]));
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

const noop = () => undefined;

describe('StudentWorkspace', () => {
  it('asks for a sign in without fetching', () => {
    render(
      <StudentWorkspace session={{ status: 'signed_out' }} onOpenRoadmap={noop} onOpenMatches={noop} onOpenAgent={noop} onOpenAssessment={noop} />,
    );
    expect(screen.getByText(/sign in to open your workspace/i)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('counts progress and blockers from the stored records', async () => {
    render(
      <StudentWorkspace session={READY} onOpenRoadmap={noop} onOpenMatches={noop} onOpenAgent={noop} onOpenAssessment={noop} />,
    );

    expect(await screen.findByText(/Hello, Avik/)).toBeTruthy();
    // 33% and 1/3 come from the stored steps, and one step is genuinely overdue.
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText(/Become a backend engineer/)).toBeTruthy();
    expect(screen.getByText(/was due 2 days ago/)).toBeTruthy();
    expect(screen.getByText(/and is still open/)).toBeTruthy();
    // The next action is the agent's own proposal, with its evidence.
    // The proposal shows as the next action and again under pending approvals.
    expect(screen.getAllByText(/Move the queue milestone to next week/).length).toBeGreaterThan(1);
    expect(screen.getByText(/Pending approvals/)).toBeTruthy();
    expect(screen.getByText(/was due 2 days ago/)).toBeTruthy();
    expect(screen.getAllByText(/model proposal/i).length).toBeGreaterThan(0);
    // Decided history and the real match summary.
    expect(screen.getByText(/Added to your roadmap/)).toBeTruthy();
    expect(screen.getByText(/Covers Kafka/)).toBeTruthy();
    expect(screen.getByText(/Database indexing/)).toBeTruthy();
    expect(screen.getByText(/6, and roadmaps are sized against this/)).toBeTruthy();
  });

  it('names the sections it could not load instead of filling them in', async () => {
    routes['/api/matches'] = { status: 500, body: { ok: false, error: 'Server error.' } };
    routes['/api/agent'] = { status: 503, body: { ok: false, error: 'Unavailable.' } };
    render(
      <StudentWorkspace session={READY} onOpenRoadmap={noop} onOpenMatches={noop} onOpenAgent={noop} onOpenAssessment={noop} />,
    );

    expect(await screen.findByText(/Could not load the agent history, mentor matches/)).toBeTruthy();
    expect(screen.getByText(/empty rather than filled with an estimate/)).toBeTruthy();
    // The sections that did load still show their real values.
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.queryByText(/Covers Kafka/)).toBeNull();
  });

  it('claims no gaps when no assessment has been run', async () => {
    routes['/api/assessment'] = { body: { ok: true, needsMoreInfo: false, assessment: null } };
    render(
      <StudentWorkspace session={READY} onOpenRoadmap={noop} onOpenMatches={noop} onOpenAgent={noop} onOpenAssessment={noop} />,
    );
    expect(await screen.findByText(/no gaps are being claimed/i)).toBeTruthy();
  });
});
