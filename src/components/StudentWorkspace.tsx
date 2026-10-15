import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  ApiError,
  api,
  type AgentView,
  type ApiProfile,
  type Assessment,
  type MatchResponse,
  type RoadmapView,
} from '../lib/api.ts';
import { signInHref, type Session } from '../lib/session.ts';

/**
 * The student dashboard, built only from stored records.
 *
 * Every number here is read back from the backend: the goal is the stored goal, progress is
 * counted from roadmap steps, blockers are steps whose stored deadline has passed or whose
 * last touch is old, and the "next action" is whatever the agent last proposed. When a
 * section cannot load, it says so instead of quietly filling in a plausible value.
 */

interface Props {
  session: Session;
  onOpenRoadmap: () => void;
  onOpenMatches: () => void;
  onOpenAgent: () => void;
  onOpenAssessment: () => void;
}

type Loaded = {
  profile: ApiProfile | null;
  roadmap: RoadmapView | null;
  agent: AgentView | null;
  matches: MatchResponse | null;
  assessment: Assessment | null;
  provisional: boolean;
  demoSeeded: boolean;
};

const EMPTY: Loaded = {
  profile: null,
  roadmap: null,
  agent: null,
  matches: null,
  assessment: null,
  provisional: false,
  demoSeeded: false,
};

const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export const StudentWorkspace: React.FC<Props> = ({
  session,
  onOpenRoadmap,
  onOpenMatches,
  onOpenAgent,
  onOpenAssessment,
}) => {
  const ready = session.status === 'ready';
  const [data, setData] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedNote, setSeedNote] = useState<string | null>(null);

  const seedDemo = async () => {
    setSeeding(true);
    setSeedNote(null);
    try {
      const result = await api.seedDemo();
      setSeedNote(result.note);
      await load();
    } catch (e) {
      setSeedNote(
        e instanceof ApiError
          ? e.userMessage
          : 'The demo scenario could not be seeded. Nothing was written.',
      );
    } finally {
      setSeeding(false);
    }
  };

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const results = await Promise.allSettled([
      api.profile(),
      api.roadmap(),
      api.agent(),
      api.matches(false),
      api.assessment(),
    ]);
    const failed: string[] = [];
    const next: Loaded = { ...EMPTY };

    if (results[0].status === 'fulfilled') {
      next.profile = results[0].value.profile;
      next.demoSeeded = results[0].value.demoSeeded ?? false;
    } else failed.push('your profile');
    if (results[1].status === 'fulfilled') next.roadmap = results[1].value;
    else failed.push('your roadmap');
    if (results[2].status === 'fulfilled') next.agent = results[2].value;
    else failed.push('the agent history');
    if (results[3].status === 'fulfilled') next.matches = results[3].value;
    else failed.push('mentor matches');
    if (results[4].status === 'fulfilled') {
      next.assessment = results[4].value.assessment ?? null;
      next.provisional = results[4].value.readiness?.provisional ?? false;
    } else failed.push('your assessment');

    setData(next);
    setFailures(failed);
    setLoading(false);
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  if (session.status === 'signed_out') {
    return (
      <Shell>
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 max-w-xl">
          <h2 className="text-lg font-medium text-white">Sign in to open your workspace</h2>
          <p className="text-sm text-white/60">
            This dashboard is assembled from your stored profile, goal, roadmap and mentor matches, so it needs a
            session. Below it you can still see the local demonstration screens.
          </p>
          <a
            href={signInHref('#/dashboard')}
            className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white inline-block hover:scale-[1.02] transition-transform"
          >
            Sign in to continue
          </a>
        </div>
      </Shell>
    );
  }

  const roadmap = data.roadmap?.roadmap ?? null;
  const goal = data.roadmap?.goal ?? null;
  const stats = roadmap?.stats;
  const pendingProposals = data.agent?.proposals.filter((p) => p.status === 'pending') ?? [];
  const decided = data.agent?.proposals.filter((p) => p.status !== 'pending') ?? [];
  const nextAction = pendingProposals[0] ?? null;
  const topMatches = (data.matches?.matches ?? []).slice(0, 3);

  const overdue = (roadmap?.steps ?? []).filter(
    (s) => s.status === 'pending' && s.deadline && new Date(s.deadline).getTime() < Date.now(),
  );
  const stale = (roadmap?.steps ?? []).filter(
    (s) => s.status === 'pending' && Date.now() - new Date(s.lastTouchedAt).getTime() > 7 * 24 * 60 * 60 * 1000,
  );

  return (
    <Shell>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Your workspace</span>
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-3xl sm:text-4xl text-white font-normal">
            {data.profile?.displayName ? `Hello, ${data.profile.displayName.split(' ')[0]}` : 'Your workspace'}
          </h2>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Everything below is read from what is stored against your account. The AI proposes; you approve.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void seedDemo()}
            title="Writes a labeled sample profile, goal and roadmap into this account, for demonstrating the agent"
            className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-white/70 text-xs disabled:opacity-40"
          >
            {seeding ? 'Seeding...' : 'Load the demo scenario'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="liquid-glass rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {data.demoSeeded && (
        <div className="mt-6 p-4 rounded-2xl bg-amber-950/25 border border-amber-500/25 text-amber-100 text-xs flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">Seeded demo scenario.</span> The profile fields, goal and roadmap on this
            account were written by the labeled demo seed so the agent has real state to work with. One milestone is
            deliberately overdue. Everything you write yourself is kept, and the seed never overwrites what you had
            already filled in.
          </span>
        </div>
      )}

      {seedNote && (
        <div className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-white/70 text-xs">{seedNote}</div>
      )}

      {failures.length > 0 && (
        <div className="mt-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-100 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Could not load {failures.join(', ')}. Those sections are empty rather than filled with an estimate.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
        <Metric label="Step progress" value={stats ? `${stats.percent}%` : 'no roadmap'} />
        <Metric label="Steps done" value={stats ? `${stats.done}/${stats.total}` : '0/0'} />
        <Metric label="Overdue" value={String(stats?.overdue ?? 0)} tone={(stats?.overdue ?? 0) > 0 ? 'warn' : undefined} />
        <Metric
          label="Profile complete"
          value={data.profile ? `${data.profile.completion}%` : 'unknown'}
          tone={data.profile && data.profile.completion < 60 ? 'warn' : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Panel
            title="Your goal"
            action={goal ? { label: 'Open roadmap', onClick: onOpenRoadmap } : undefined}
            empty={!goal ? 'No goal stored yet. A goal is what the roadmap and the matching are generated for.' : null}
            emptyAction={!goal ? { label: 'Set a goal', onClick: onOpenRoadmap } : undefined}
          >
            {goal && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Target className="w-4 h-4 text-white/40" />
                  <span className="text-base text-white">{goal.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white/5 border-white/15 text-white/60">
                    {goal.status}
                  </span>
                </div>
                {goal.rationale && <p className="text-xs text-white/55 leading-relaxed">{goal.rationale}</p>}
                {roadmap && (
                  <p className="text-xs text-white/45">
                    {roadmap.title} · revision {roadmap.revision} ·{' '}
                    {stats?.nextDeadline ? `next deadline ${shortDate(stats.nextDeadline)}` : 'no deadlines set'}
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="Next recommended action"
            action={{ label: 'Open the agent', onClick: onOpenAgent }}
            empty={
              nextAction
                ? null
                : data.agent
                ? 'The agent has not proposed anything for your current state. Ask it for one action when you want a suggestion.'
                : 'The agent history could not be loaded.'
            }
            emptyAction={{ label: 'Ask for a proposal', onClick: onOpenAgent }}
          >
            {nextAction && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded border bg-amber-500/10 text-amber-200 border-amber-500/20">
                    waiting for your decision
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      nextAction.engine === 'gemini'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : 'bg-white/5 text-white/60 border-white/15'
                    }`}
                  >
                    {nextAction.engine === 'gemini' ? 'model proposal' : 'demo engine: no provider key configured'}
                  </span>
                  <span className="text-[10px] text-white/40 ml-auto">
                    triggered by {nextAction.triggerKind.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-white/85">{nextAction.title}</p>
                <p className="text-xs text-white/60 leading-relaxed">{nextAction.detail}</p>
                <ul className="space-y-1">
                  {nextAction.evidence.map((item) => (
                    <li key={`${item.ref}:${item.detail}`} className="text-xs text-white/60 flex items-start gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 shrink-0">
                        {item.ref}
                      </span>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onOpenAgent}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 text-xs inline-flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Review and decide</span>
                </button>
              </div>
            )}
          </Panel>

          <Panel
            title="Blockers"
            empty={
              overdue.length === 0 && stale.length === 0
                ? 'Nothing is overdue and nothing has gone untouched for a week.'
                : null
            }
          >
            <ul className="space-y-2">
              {overdue.map((step) => (
                <li key={step.id} className="text-xs text-amber-200 flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {step.title} was due {shortDate(step.deadline)} and is still open.
                  </span>
                </li>
              ))}
              {stale.map((step) => (
                <li key={`stale-${step.id}`} className="text-xs text-white/60 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-white/35" />
                  <span>
                    {step.title} has not been touched since {shortDate(step.lastTouchedAt)}.
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Recent agent actions"
            empty={decided.length === 0 ? 'No proposal has been decided yet, so there is nothing in the history.' : null}
          >
            <ul className="space-y-2">
              {decided.slice(0, 5).map((proposal) => (
                <li key={proposal.id} className="text-xs text-white/70 flex items-start gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                      proposal.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : proposal.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        : 'bg-white/5 text-white/50 border-white/15'
                    }`}
                  >
                    {proposal.status}
                  </span>
                  <span>
                    {proposal.title}
                    {proposal.result && <span className="block text-white/45 mt-0.5">{proposal.result}</span>}
                  </span>
                  <span className="ml-auto text-[10px] text-white/35 shrink-0">
                    {shortDate(proposal.decidedAt ?? proposal.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title="Pending approvals"
            empty={pendingProposals.length === 0 ? 'Nothing is waiting on you.' : null}
          >
            <ul className="space-y-2">
              {pendingProposals.map((proposal) => (
                <li key={proposal.id} className="text-xs text-white/75 flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                  <span>{proposal.title}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Skills, as assessed"
            action={{ label: 'Open assessment', onClick: onOpenAssessment }}
            empty={
              data.assessment
                ? null
                : 'No assessment has been run yet, so no gaps are being claimed.'
            }
            emptyAction={{ label: 'Run the assessment', onClick: onOpenAssessment }}
          >
            {data.assessment && (
              <div className="space-y-3">
                {data.provisional && (
                  <p className="text-[11px] text-amber-200/85">
                    Provisional: your profile is thin in places, so these findings are labelled rather than treated as
                    settled.
                  </p>
                )}
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1">Target role</div>
                  <p className="text-sm text-white/85">{data.assessment.targetRole}</p>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">Top gaps</div>
                  <ul className="space-y-1.5">
                    {data.assessment.gaps.slice(0, 4).map((gap) => (
                      <li key={gap.skill} className="text-xs text-white/70">
                        <span className="text-white/85">{gap.skill}</span>{' '}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ml-1 ${
                            gap.priority === 'high'
                              ? 'bg-rose-500/10 text-rose-200 border-rose-500/20'
                              : 'bg-white/5 text-white/50 border-white/15'
                          }`}
                        >
                          {gap.priority}
                        </span>
                        <span className="block text-white/45 mt-0.5">{gap.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">Strengths</div>
                  <ul className="space-y-1">
                    {data.assessment.strengths.slice(0, 3).map((strength) => (
                      <li key={strength.skill} className="text-xs text-white/70 flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-300 shrink-0" />
                        <span>{strength.skill}</span>
                        <span className="text-[10px] text-white/40">{strength.source.replace('_', ' ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title="Mentor recommendations"
            action={{ label: 'See all matches', onClick: onOpenMatches }}
            empty={
              topMatches.length === 0
                ? 'No mentor passed the eligibility rules for your current profile.'
                : null
            }
          >
            <ul className="space-y-3">
              {topMatches.map((match) => (
                <li key={match.mentor.id} className="text-xs text-white/70">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/85">{match.mentor.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">
                      fit {match.score}
                    </span>
                  </div>
                  <p className="text-white/50 mt-1 leading-relaxed">{match.summary}</p>
                  {match.explanation.caveats.length > 0 && (
                    <p className="text-[10px] text-white/40 mt-1">{match.explanation.caveats.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Weekly hours you entered">
            <p className="text-sm text-white/80">
              {data.profile?.hoursPerWeek
                ? `${data.profile.hoursPerWeek}, and roadmaps are sized against this.`
                : 'Not set. Add it on your profile so plans are sized against it.'}
            </p>
          </Panel>
        </div>
      </div>
    </Shell>
  );
};

function Panel({
  title,
  children,
  empty,
  emptyAction,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  empty?: string | null;
  emptyAction?: { label: string; onClick: () => void };
  action?: { label: string; onClick: () => void };
}) {
  const isEmpty = empty !== null && empty !== undefined;
  return (
    <section className="p-5 rounded-2xl bg-white/[0.02] border border-white/10">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-xs uppercase tracking-wider text-white/50">{title}</h3>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="ml-auto text-[11px] text-white/50 hover:text-white inline-flex items-center gap-1"
          >
            <span>{action.label}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {isEmpty ? (
        <div className="space-y-3">
          <p className="text-xs text-white/55 leading-relaxed">{empty}</p>
          {emptyAction && (
            <button
              type="button"
              onClick={emptyAction.onClick}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 text-xs"
            >
              {emptyAction.label}
            </button>
          )}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone === 'warn' ? 'text-amber-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen pt-28 pb-16 px-6 max-w-7xl mx-auto text-white">{children}</div>;
}
