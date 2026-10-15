import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Loader2, RefreshCw, Users, X } from 'lucide-react';
import { ApiError, api, type MenteeView, type RequestView } from '../lib/api.ts';
import { signInHref, type Session } from '../lib/session.ts';

/**
 * The mentor side, on stored records only.
 *
 * A mentor sees a student's context after a request exists, and the context is the summary
 * the server chooses to expose: program, year, the skills they say they have and want, and
 * the goal they wrote. Nothing else on the student's account is readable from here, and
 * every transition is re-authorised on the server rather than trusted from this screen.
 */

interface Props {
  session: Session;
}

const err = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e : new ApiError({ kind: 'server', status: 0, message: fallback });

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Context({ request }: { request: RequestView }) {
  const mentee = request.mentee;
  if (!mentee) return null;
  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-white/45">What they shared with you</div>
      <div className="text-xs text-white/75">
        {mentee.name}
        {mentee.program && ` · ${mentee.program}`}
        {mentee.year && ` · ${mentee.year}`}
      </div>
      {mentee.goal && <p className="text-xs text-white/60 leading-relaxed">{mentee.goal}</p>}
      {mentee.skillsHave.length > 0 && (
        <p className="text-[11px] text-white/50">
          <span className="text-white/35">Has:</span> {mentee.skillsHave.join(', ')}
        </p>
      )}
      {mentee.skillsWant.length > 0 && (
        <p className="text-[11px] text-white/50">
          <span className="text-white/35">Wants:</span> {mentee.skillsWant.join(', ')}
        </p>
      )}
      <p className="text-[10px] text-white/35">
        This summary is all the server exposes about them. Their other fields are not readable from your account.
      </p>
    </div>
  );
}

export const MentorInbox: React.FC<Props> = ({ session }) => {
  const ready = session.status === 'ready';
  const [incoming, setIncoming] = useState<RequestView[] | null>(null);
  const [mentees, setMentees] = useState<MenteeView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    const [requests, menteeResult] = await Promise.allSettled([api.requests(), api.mentees()]);
    if (requests.status === 'fulfilled') setIncoming(requests.value.incoming ?? []);
    else setError(err(requests.reason, 'Incoming requests could not be loaded.'));
    if (menteeResult.status === 'fulfilled') setMentees(menteeResult.value.mentees);
    else setMentees([]);
    setLoading(false);
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (request: RequestView, action: 'accept' | 'decline') => {
    setBusyId(request.id);
    setError(null);
    setOutcome(null);
    try {
      const result = await api.transitionRequest(request.id, action, draft[request.id] ?? '');
      setOutcome(
        action === 'accept'
          ? `Accepted ${result.request.mentee?.name ?? 'the request'}. It is stored as accepted and they can see the change.`
          : `Declined ${result.request.mentee?.name ?? 'the request'}. It stays in the record as declined.`,
      );
      await load();
    } catch (e) {
      setError(err(e, 'That decision was not applied.'));
    } finally {
      setBusyId(null);
    }
  };

  if (session.status === 'signed_out') {
    return (
      <Shell>
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 max-w-xl">
          <h2 className="text-lg font-medium text-white">Sign in with a mentor account</h2>
          <p className="text-sm text-white/60">
            Incoming requests and the mentees you have accepted are read from your account, so this screen needs a
            session with the mentor role set.
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

  const pending = (incoming ?? []).filter((r) => r.status === 'pending');
  const decided = (incoming ?? []).filter((r) => r.status !== 'pending');

  return (
    <Shell>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Mentor hub</span>
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-3xl sm:text-4xl text-white font-normal">
            Requests waiting on you
          </h2>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Requests arrive with the context the student chose to share. Accepting stores the decision; the student sees
            it on their own dashboard.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || !ready}
          onClick={() => void load()}
          className="liquid-glass rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 inline-flex items-center gap-2 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="mt-6 p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-100 text-sm space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4" />
            <span>That did not work</span>
          </div>
          <p className="text-xs text-rose-100/80">{error.userMessage}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20"
          >
            Try again
          </button>
        </div>
      )}
      {outcome && (
        <div className="mt-6 p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/25 text-emerald-100 text-xs flex items-start gap-2">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{outcome}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-6">
        <Metric label="Awaiting your answer" value={String(pending.length)} tone={pending.length ? 'warn' : undefined} />
        <Metric label="Accepted mentees" value={String(mentees?.length ?? 0)} />
        <Metric label="Requests answered" value={String(decided.length)} />
      </div>

      <div className="space-y-4">
        {incoming === null && loading && (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center gap-3 text-sm text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Reading your requests...</span>
          </div>
        )}
        {incoming !== null && pending.length === 0 && (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 text-sm text-white/60">
            Nothing is waiting on you. A request appears here when a student sends one from their match list.
          </div>
        )}

        {pending.map((request) => (
          <div key={request.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded border bg-white/5 text-white/70 border-white/15">
                incoming request
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-200 border-amber-500/20">
                pending
              </span>
              <span className="text-[10px] text-white/40">sent {shortDate(request.createdAt)}</span>
              {request.matchScore !== null && (
                <span className="text-[10px] text-white/40">
                  the fit score they saw: {request.matchScore}
                </span>
              )}
            </div>
            {request.goalTitle && (
              <p className="text-xs text-white/60">
                <span className="text-white/35 uppercase tracking-wider text-[10px] mr-2">Goal</span>
                {request.goalTitle}
              </p>
            )}
            {request.message && <p className="text-sm text-white/75 leading-relaxed">{request.message}</p>}
            <Context request={request} />
            <textarea
              aria-label="Your reply"
              rows={2}
              value={draft[request.id] ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, [request.id]: e.target.value }))}
              placeholder="Optional reply, stored with the decision"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => void decide(request, 'accept')}
                className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                {busyId === request.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Accept</span>
              </button>
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => void decide(request, 'decline')}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
                <span>Decline</span>
              </button>
              <span className="text-[10px] text-white/35 ml-auto">
                Both are stored as the final state for this request. No email is sent.
              </span>
            </div>
          </div>
        ))}
      </div>

      {mentees !== null && mentees.length > 0 && (
        <div className="mt-10 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-white/50">Your mentees</h3>
          {mentees.map((mentee) => (
            <div key={mentee.requestId} className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-white/85">{mentee.name}</span>
                {mentee.program && <span className="text-[11px] text-white/45">{mentee.program}</span>}
                <span className="text-[10px] text-white/35 ml-auto inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  since {shortDate(mentee.since)}
                </span>
              </div>
              {mentee.goal && <p className="text-xs text-white/60">{mentee.goal}</p>}
              {mentee.goals.length > 0 && (
                <ul className="space-y-1">
                  {mentee.goals.map((goal) => (
                    <li key={goal.id} className="text-xs text-white/60 flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">
                        {goal.status}
                      </span>
                      <span>{goal.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="mt-10 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-white/50">Answered, kept in the record</h3>
          {decided.map((request) => (
            <div key={request.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex flex-wrap items-center gap-2">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  request.status === 'accepted'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-white/5 text-white/50 border-white/15'
                }`}
              >
                {request.status}
              </span>
              <span className="text-sm text-white/75">{request.mentee?.name ?? 'A student'}</span>
              {request.response && <span className="text-xs text-white/45">{request.response}</span>}
              <span className="text-[10px] text-white/35 ml-auto">{shortDate(request.updatedAt)}</span>
            </div>
          ))}
        </div>
      )}
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
