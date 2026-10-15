import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Flag,
  History,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { ApiError, api, type AgentProposal, type AgentView } from '../lib/api.ts';
import { signInHref, type Session } from '../lib/session.ts';

/**
 * The adaptation agent, as the student meets it.
 *
 * The whole point of this screen is that the app proposes and the person decides. The
 * proposal is shown with its reasoning, its evidence and the engine that produced it;
 * approve applies exactly what is on screen, edit changes it before it is applied, and
 * reject keeps it in the history as rejected. Nothing is written to the roadmap until
 * one of those buttons is pressed.
 */

interface Props {
  session: Session;
}

const ACTION_LABEL: Record<AgentProposal['actionKind'], string> = {
  create_milestone: 'Add a milestone',
  update_milestone: 'Change a milestone',
  save_action_item: 'Add one small task',
  prepare_request: 'Prepare a mentorship request',
};

function StatusChip({ status }: { status: AgentProposal['status'] }) {
  const tone =
    status === 'approved'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : status === 'pending'
      ? 'bg-amber-500/10 text-amber-200 border-amber-500/20'
      : status === 'failed'
      ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
      : 'bg-white/5 text-white/50 border-white/15';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tone}`}>{status}</span>;
}

function ProposalCard({
  proposal,
  busy,
  onApprove,
  onReject,
  onReport,
}: {
  proposal: AgentProposal;
  busy: boolean;
  onApprove: (edit?: { title?: string }) => void;
  onReject: () => void;
  onReport: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const pending = proposal.status === 'pending';

  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] px-2 py-0.5 rounded border bg-white/5 text-white/70 border-white/15">
          {ACTION_LABEL[proposal.actionKind]}
        </span>
        <StatusChip status={proposal.status} />
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            proposal.engine === 'gemini'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-200 border-amber-500/20'
          }`}
        >
          {proposal.engine === 'gemini' ? 'Proposed by the model' : 'Demo engine: no provider key configured'}
        </span>
        <span className="text-[10px] text-white/40 ml-auto">
          triggered by {proposal.triggerKind.replace(/_/g, ' ')}
        </span>
      </div>

      {editing ? (
        <label className="block space-y-1.5">
          <span className="text-xs text-white/70">Edit the action before approving</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-white/40"
          />
        </label>
      ) : (
        <div>
          <h3 className="text-base font-medium text-white">{proposal.title}</h3>
          <p className="text-sm text-white/70 mt-1 leading-relaxed">{proposal.detail}</p>
        </div>
      )}

      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-white/45">Why this action</div>
        <p className="text-xs text-white/70 leading-relaxed">{proposal.reasoning}</p>
        <div className="text-[11px] uppercase tracking-wider text-white/45 pt-2">Evidence it rests on</div>
        <ul className="space-y-1">
          {proposal.evidence.map((item) => (
            <li key={`${item.ref}:${item.detail}`} className="text-xs text-white/70 flex items-start gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 shrink-0">
                {item.ref}
              </span>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {(proposal.estimate || proposal.deadline) && (
        <div className="text-xs text-white/50 flex items-center gap-3">
          {proposal.estimate && <span>Estimate: {proposal.estimate}</span>}
          {proposal.deadline && <span>Deadline: {proposal.deadline}</span>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="w-20 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-white/50" style={{ width: `${Math.round(proposal.confidence * 100)}%` }} />
        </div>
        <span className="text-[10px] text-white/40">
          model confidence {Math.round(proposal.confidence * 100)}% · its own uncertainty, not a probability of success
        </span>
      </div>

      {pending ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(editing ? { title } : undefined)}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{editing ? 'Approve the edit' : 'Approve'}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(!editing)}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>{editing ? 'Cancel edit' : 'Edit first'}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reject</span>
          </button>
          <button
            type="button"
            onClick={onReport}
            className="ml-auto text-[11px] text-white/40 hover:text-white inline-flex items-center gap-1.5"
          >
            <Flag className="w-3 h-3" />
            <span>Report</span>
          </button>
        </div>
      ) : (
        <div className="text-xs text-white/60 border-t border-white/5 pt-3">{proposal.result}</div>
      )}
    </div>
  );
}

export const AgentPanel: React.FC<Props> = ({ session }) => {
  const [view, setView] = useState<AgentView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const ready = session.status === 'ready';

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      setView(await api.agent());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ kind: 'server', status: 0, message: 'Could not load the agent.' }));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  const propose = async () => {
    setLoading(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await api.propose();
      if (result.reused) setOutcome('That action was already proposed for your current state, so it was not generated again.');
      setView(await api.agent());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ kind: 'server', status: 0, message: 'No action could be proposed.' }));
    } finally {
      setLoading(false);
    }
  };

  const decide = async (proposal: AgentProposal, kind: 'approve' | 'reject', edit?: { title?: string }) => {
    setBusyId(proposal.id);
    setError(null);
    setOutcome(null);
    try {
      const result = await api.decide(proposal.id, kind, edit);
      setOutcome(result.changed.length > 0 ? `${result.message} ${result.changed.join(' ')}` : result.message);
      setView(await api.agent());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ kind: 'server', status: 0, message: 'That decision could not be applied.' }));
    } finally {
      setBusyId(null);
    }
  };

  /*
   * Without a reachable API the agent has nothing to read and no button can work, so it
   * says that rather than rendering an empty panel with a dead control. This mirrors the
   * assessment screen's state, and it keeps the dashboard honest in a build whose backend
   * is not running instead of looking broken.
   */
  if (session.status === 'error') {
    return (
      <Shell>
        <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-100 text-sm space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4" />
            <span>The backend is not answering</span>
          </div>
          <p className="text-xs text-amber-100/80">{session.error.userMessage}</p>
          <p className="text-xs text-amber-100/60">
            The agent reads your stored roadmap on the server and writes only what you approve, so it needs the API
            running. Nothing here is simulated in its place.
          </p>
        </div>
      </Shell>
    );
  }

  if (session.status === 'signed_out') {
    return (
      <Shell>
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 max-w-xl">
          <h2 className="text-lg font-medium text-white">Sign in to use the agent</h2>
          <p className="text-sm text-white/60">
            The agent reads your stored profile and roadmap and writes only what you approve, so it needs a session.
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

  const pending = view?.proposals.filter((p) => p.status === 'pending') ?? [];
  const history = view?.proposals ?? [];

  return (
    <Shell>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Adaptation agent</span>
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-3xl sm:text-4xl text-white font-normal">
            What to do next, and why
          </h2>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            The agent reads your stored state, notices what has slipped, proposes one bounded action with its
            reasoning, and waits. Nothing changes on your roadmap until you approve it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void propose()}
          disabled={loading || !ready}
          className="liquid-glass rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 inline-flex items-center gap-2 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>Propose a next action</span>
        </button>
      </div>

      {view && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
          <Metric label="Steps done" value={`${view.state.doneCount}/${view.state.totalCount}`} />
          <Metric label="Overdue" value={String(view.state.overdueCount)} tone={view.state.overdueCount ? 'warn' : undefined} />
          <Metric label="Not touched in a week" value={String(view.state.stalledCount)} />
          <Metric label="Roadmap" value={view.state.hasRoadmap ? 'active' : 'none'} />
        </div>
      )}

      {error && (
        <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-100 text-sm space-y-3 mt-6">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4" />
            <span>That did not work</span>
          </div>
          <p className="text-xs text-rose-100/80">{error.userMessage}</p>
          <div className="flex items-center gap-3">
            {error.retryable && (
              <button type="button" onClick={() => void propose()} className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">
                Try again
              </button>
            )}
            <span className="text-[11px] text-rose-100/60">Nothing on your roadmap was changed.</span>
          </div>
        </div>
      )}

      {outcome && (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/25 text-emerald-100 text-xs mt-6 flex items-start gap-2">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{outcome}</span>
        </div>
      )}

      <div className="mt-8 space-y-4">
        <h3 className="text-xs uppercase tracking-wider text-white/50">Waiting for your decision</h3>
        {!view && loading && (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center gap-3 text-sm text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Reading your roadmap...</span>
          </div>
        )}
        {view && pending.length === 0 && (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 text-sm text-white/60">
            Nothing is waiting for a decision. {view.findings[0]?.detail}
          </div>
        )}
        {pending.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            busy={busyId === proposal.id}
            onApprove={(edit) => void decide(proposal, 'approve', edit)}
            onReject={() => void decide(proposal, 'reject')}
            onReport={() => void api.reportFeedback({ feature: 'agent', subject: proposal.title }).catch(() => undefined)}
          />
        ))}
      </div>

      {history.filter((p) => p.status !== 'pending').length > 0 && (
        <div className="mt-10 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-white/50 flex items-center gap-2">
            <History className="w-3.5 h-3.5" />
            History, kept rather than deleted
          </h3>
          {history
            .filter((p) => p.status !== 'pending')
            .map((proposal) => (
              <div key={proposal.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <StatusChip status={proposal.status} />
                  <span className="text-sm text-white/80">{proposal.title}</span>
                  <span className="text-[10px] text-white/40 ml-auto">
                    {proposal.executedAt ? `applied ${new Date(proposal.executedAt).toLocaleString()}` : ''}
                  </span>
                </div>
                {proposal.result && <p className="text-xs text-white/55">{proposal.result}</p>}
              </div>
            ))}
        </div>
      )}

      {view && <p className="text-[11px] text-white/40 mt-8 leading-relaxed">{view.note}</p>}
    </Shell>
  );
};

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
