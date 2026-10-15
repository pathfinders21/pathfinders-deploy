import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Flag,
  Info,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { ApiError, api, type MatchResponse, type RankedMentor } from '../lib/api.ts';
import { signInHref, type Session } from '../lib/session.ts';

/**
 * Explainable mentor matching.
 *
 * The order and the numbers come from the deterministic engine on the server, computed
 * from stored records. The model is only ever allowed to rephrase what the engine already
 * found, which is why every card names the source of its summary. A score here is a fit
 * score for ranking and is labelled as one, never as a probability of anything.
 */

interface Props {
  session: Session;
  onRequested?: (name: string) => void;
}

const err = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e : new ApiError({ kind: 'server', status: 0, message: fallback });

function MatchCard({
  match,
  busy,
  requested,
  onRequest,
  onReport,
}: {
  match: RankedMentor;
  busy: boolean;
  requested: boolean;
  onRequest: (message: string) => void;
  onReport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const { mentor, explanation, overlaps } = match;

  const needsAddressed = [
    ...overlaps.skills.map((s) => `Covers ${s}`),
    ...overlaps.goals.map((g) => `Has mentored for ${g}`),
    ...overlaps.industries.map((i) => `Works in ${i}`),
  ].slice(0, 5);

  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base text-white">{mentor.name}</h3>
            {mentor.headline && <span className="text-[11px] text-white/45">{mentor.headline}</span>}
            {!mentor.ready && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200">
                profile incomplete: {mentor.missing.join(', ')}
              </span>
            )}
          </div>
          <p className="text-sm text-white/70 mt-2 leading-relaxed">{match.summary}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-semibold text-white">{match.score}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">fit score</div>
          <div className="text-[10px] text-white/40">{match.confidence} confidence</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            match.phrasedBy === 'gemini'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              : 'bg-white/5 text-white/60 border-white/15'
          }`}
        >
          {match.phrasedBy === 'gemini'
            ? 'Summary written by the model, from computed factors'
            : 'Summary written by the app, from computed factors'}
        </span>
        {explanation.caveats.map((caveat) => (
          <span key={caveat} className="text-[10px] px-2 py-0.5 rounded-full border bg-white/5 text-white/50 border-white/10">
            {caveat}
          </span>
        ))}
      </div>

      {needsAddressed.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">What this addresses for you</div>
          <ul className="flex flex-wrap gap-1.5">
            {needsAddressed.map((need) => (
              <li key={need} className="text-[11px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70">
                {need}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10">
        <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">
          How the {match.score} was computed
        </div>
        <ul className="space-y-1.5">
          {match.factors.map((factor) => (
            <li key={factor.key} className="text-xs text-white/65">
              {/* Stacks on a phone: a fixed label column plus a bar plus the numbers
                  overflows a 375px screen, so the label takes its own row there. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-full sm:w-44 sm:shrink-0 text-white/60">{factor.label}</span>
                <span className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden max-w-[140px] min-w-[80px]">
                  <span
                    className={`block h-full ${factor.normalized === null ? 'bg-white/15' : 'bg-white/40'}`}
                    style={{ width: `${Math.round((factor.normalized ?? 0) * 100)}%` }}
                  />
                </span>
                <span className="text-[10px] text-white/45 tabular-nums">
                  {factor.normalized === null ? 'no data' : `${Math.round(factor.normalized * 100)}%`}
                  {' · weight '}
                  {factor.weight}
                </span>
              </div>
              <span className="block text-[10px] text-white/40 mt-0.5">{factor.note}</span>
            </li>
          ))}
        </ul>
        {match.missing.length > 0 && (
          <p className="text-[10px] text-amber-200/80 mt-2">
            Not evaluated, because one side has no data: {match.missing.join(', ')}. An unknown factor is dropped and
            the rest are renormalised, not scored as zero.
          </p>
        )}
      </div>

      {mentor.expertise.length > 0 && (
        <p className="text-xs text-white/55">
          <span className="text-white/40 uppercase tracking-wider text-[10px] mr-2">Expertise on record</span>
          {mentor.expertise.slice(0, 8).join(' · ')}
        </p>
      )}
      {mentor.bio && <p className="text-xs text-white/50 leading-relaxed">{mentor.bio.slice(0, 400)}</p>}

      {open ? (
        <div className="space-y-2">
          <textarea
            aria-label={`Message to ${mentor.name}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Say what you want help with. The mentor sees this and your goal, and nothing else."
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-white/40"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onRequest(message)}
              className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Send request</span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {requested ? (
            <span className="text-xs text-emerald-300 inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Request sent. It is pending until they answer.
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 text-xs inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Request mentorship</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReport}
            className="text-[11px] text-white/40 hover:text-white inline-flex items-center gap-1.5"
          >
            <Flag className="w-3 h-3" />
            <span>Report a poor recommendation</span>
          </button>
        </div>
      )}
    </div>
  );
}

export const MatchPanel: React.FC<Props> = ({ session, onRequested }) => {
  const ready = session.status === 'ready';
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [requested, setRequested] = useState<Record<string, boolean>>({});
  const [phrased, setPhrased] = useState(false);

  const load = useCallback(
    async (phrase: boolean) => {
      if (!ready) return;
      setLoading(true);
      setError(null);
      try {
        setData(await api.matches(phrase));
      } catch (e) {
        setError(err(e, 'Matches could not be loaded.'));
      } finally {
        setLoading(false);
      }
    },
    [ready],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const request = async (match: RankedMentor, message: string) => {
    setBusyId(match.mentor.id);
    setError(null);
    setOutcome(null);
    try {
      const result = await api.createRequest({ mentorId: match.mentor.id, message });
      setRequested((prev) => ({ ...prev, [match.mentor.id]: true }));
      setOutcome(
        result.request.matchScore === null
          ? `Request to ${match.mentor.name} is pending. It is stored with the score you saw.`
          : `Request to ${match.mentor.name} is pending, stored with the fit score of ${result.request.matchScore}.`,
      );
      onRequested?.(match.mentor.name);
    } catch (e) {
      setError(err(e, 'That request was not created.'));
    } finally {
      setBusyId(null);
    }
  };

  if (session.status === 'signed_out') {
    return (
      <Shell>
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 max-w-xl">
          <h2 className="text-lg font-medium text-white">Sign in to see your matches</h2>
          <p className="text-sm text-white/60">
            Recommendations are computed from your stored profile, goals and skills, so the directory below is only a
            preview until you sign in.
          </p>
          <a
            href={signInHref('#/mentors')}
            className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white inline-block hover:scale-[1.02] transition-transform"
          >
            Sign in to continue
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mentor matching</span>
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-3xl sm:text-4xl text-white font-normal">
            Why each mentor, in numbers you can check
          </h2>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Eligibility filters run first, then a deterministic score from your stored records, then a written reason.
            Nobody is recommended from a record that does not exist.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={loading || !ready}
            onClick={() => void load(phrased)}
            className="liquid-glass rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Recompute</span>
          </button>
          <label className="text-[11px] text-white/50 inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={phrased}
              onChange={(e) => {
                setPhrased(e.target.checked);
                void load(e.target.checked);
              }}
              className="accent-white"
            />
            <span>Let the model rephrase the summaries</span>
          </label>
        </div>
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
            onClick={() => void load(phrased)}
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

      {data && (
        <div className="mt-6 p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-start gap-3">
          <Info className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
          <div className="text-[11px] text-white/55 space-y-1">
            <p>{data.note}</p>
            <p>{data.weightsNote}</p>
            <p className="text-white/40">{data.disclaimer}</p>
            <p className="text-white/40">
              {data.candidatePool} mentor records were read from the database
              {data.excludedReasonText.length > 0 && `; ${data.excludedReasonText.join('; ')}`}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {!data && loading && (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center gap-3 text-sm text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Reading mentor records...</span>
          </div>
        )}
        {data && data.matches.length === 0 && (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 text-sm text-white/60 space-y-2">
            <p>No mentor passed the eligibility rules, so nothing is being proposed.</p>
            {data.excludedReasonText.length > 0 && <p className="text-xs text-white/45">{data.excludedReasonText.join(' · ')}</p>}
            {data.profile.completion < 100 && (
              <p className="text-xs text-amber-200/80">
                Your profile is {data.profile.completion}% complete. Adding skills and interests gives the engine
                something to match on.
              </p>
            )}
          </div>
        )}
        {data?.matches.map((match) => (
          <MatchCard
            key={match.mentor.id}
            match={match}
            busy={busyId === match.mentor.id}
            requested={Boolean(requested[match.mentor.id])}
            onRequest={(message) => void request(match, message)}
            onReport={() =>
              void api.reportFeedback({ feature: 'match', subject: match.mentor.name }).catch(() => undefined)
            }
          />
        ))}
      </div>
    </Shell>
  );
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen pt-28 pb-16 px-6 max-w-7xl mx-auto text-white">{children}</div>;
}
