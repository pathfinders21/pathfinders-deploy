import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Send, Sparkles } from 'lucide-react';
import { ApiError, api, type AssistantMentor, type AssistantTurn } from '../lib/api.ts';
import { localAssistantAnswer } from '../lib/localAssistant.ts';
import { INITIAL_MENTORS } from '../data/mockMentors.ts';
import type { Session } from '../lib/session.ts';

/**
 * The assistant conversation itself, with no chrome around it.
 *
 * Two shells use it: the floating dock (a quick question from anywhere) and the
 * `#/assistant` screen (a page of its own, reachable from the navigation). Keeping the
 * conversation in one component means the rules are enforced in one place: where the
 * answer came from is always labelled, every mentor offered comes with the reason it was
 * chosen, and a failure is shown with a retry instead of an empty reply.
 *
 * With a session and a running Worker the reply is written by Gemini from the stored
 * profile, and the mentors are the matching engine's own ranking. Without either, the
 * deterministic demo engine answers in the browser and says so.
 */

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** The question this answer belongs to, so a request carries its context. */
  topic?: string;
  followUps?: string[];
  mentors?: AssistantMentor[];
  engine?: 'gemini' | 'demo';
  local?: boolean;
  note?: string;
  considered?: number;
};

export interface AssistantChatProps {
  session: Session;
  onRequestMentor: (mentor: AssistantMentor, topic: string) => void;
  onBrowseMentors: () => void;
  /** The dock is a small panel; the screen is a page. Only the sizing differs. */
  variant?: 'dock' | 'page';
}

const EXAMPLES = [
  'My queue worker bills customers twice when a charge is retried',
  'Who should I talk to about system design interviews?',
  'How do I decide between Postgres and DynamoDB for this?',
];

function EngineLabel({ message }: { message: Message }) {
  if (message.engine === 'gemini') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
        Written by Gemini
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-200 border-amber-500/20">
      {message.local ? 'Demo engine: computed in your browser' : 'Demo engine: no provider key configured'}
    </span>
  );
}

export const AssistantChat: React.FC<AssistantChatProps> = ({
  session,
  onRequestMentor,
  onBrowseMentors,
  variant = 'dock',
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const lastQuestion = useRef<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // The server path needs a session. Signed out, or with no Worker answering, the
  // deterministic engine runs here instead: still useful, and it says which one answered.
  const live = session.status === 'ready';

  useEffect(() => {
    const list = listRef.current;
    // jsdom and older browsers do not implement these; a missing scroll is never a crash.
    if (list && typeof list.scrollTo === 'function' && list.scrollHeight > list.clientHeight) {
      list.scrollTo({ top: list.scrollHeight });
      return;
    }
    if (variant === 'page' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: window.scrollY + 240, behavior: 'smooth' });
    }
  }, [messages, sending, variant]);

  const append = (message: Message) => setMessages((prev) => [...prev, message]);

  const send = async (question: string) => {
    const message = question.trim();
    if (!message || sending) return;

    lastQuestion.current = message;
    setError(null);
    setInput('');
    append({ id: `u-${Date.now()}`, role: 'user', text: message });
    setSending(true);

    try {
      if (!live) {
        const local = localAssistantAnswer({
          message,
          mentors: INITIAL_MENTORS,
          reason: session.status === 'signed_out' ? 'signed_out' : 'offline',
        });
        append({
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: local.reply,
          topic: message,
          followUps: local.followUps,
          mentors: local.mentors,
          engine: local.engine,
          local: true,
          note: local.note,
          considered: local.considered,
        });
        return;
      }

      const history: AssistantTurn[] = messages.slice(-6).map((entry) => ({
        role: entry.role,
        text: entry.text,
      }));
      const result = await api.askAssistant({ message, history });
      append({
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: result.reply,
        topic: message,
        followUps: result.followUps,
        mentors: result.mentors,
        engine: result.engine,
        note: result.note,
        considered: result.considered,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError({ kind: 'server', status: 0, message: 'That question did not go through.' }),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={variant === 'dock' ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col'}>
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        className={
          variant === 'dock' ? 'flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4' : 'space-y-5 px-6 sm:px-8 py-6'
        }
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-white/60 leading-relaxed">
              Describe the problem you are stuck on, or ask who to talk to. You get the next concrete thing to try, and
              the mentors who fit it, with the reason each one was chosen.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void send(example)}
                  className="text-[11px] text-left px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] text-xs sm:text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl bg-white/10 text-white">
                {message.text}
              </p>
            </div>
          ) : (
            <div key={message.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <EngineLabel message={message} />
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{message.text}</p>

              {message.followUps && message.followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {message.followUps.map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => void send(followUp)}
                      className="text-[11px] text-left px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              )}

              {message.mentors && message.mentors.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-white/45">
                    Mentors who fit this
                    {message.considered ? ` · ${message.considered} considered` : ''}
                  </div>
                  {message.mentors.map((mentor) => (
                    <div key={mentor.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-white">{mentor.name}</div>
                          <div className="text-[10px] text-white/50">{mentor.headline || 'Mentor'}</div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60 shrink-0">
                          {message.local
                            ? `${mentor.score} shared ${mentor.score === 1 ? 'topic' : 'topics'}`
                            : `${mentor.score}/100 fit`}
                        </span>
                      </div>
                      {mentor.expertise.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {mentor.expertise.slice(0, 4).map((skill) => (
                            <span key={skill} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-white/55 leading-relaxed">{mentor.summary}</p>
                      <button
                        type="button"
                        aria-label={`Request mentorship from ${mentor.name}`}
                        onClick={() => onRequestMentor(mentor, message.topic ?? '')}
                        className="liquid-glass rounded-full px-4 py-1.5 text-[11px] font-medium text-white hover:scale-[1.02] transition-transform cursor-pointer"
                      >
                        Request mentorship
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {message.note && <p className="text-[10px] text-white/40 leading-relaxed">{message.note}</p>}
            </div>
          ),
        )}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Working it out...</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-100 text-xs space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>That did not work</span>
            </div>
            <p className="text-rose-100/80">{error.userMessage}</p>
            <button
              type="button"
              onClick={() => void send(lastQuestion.current)}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <div
        className={
          variant === 'dock'
            ? 'border-t border-white/10 px-5 py-4 space-y-2'
            : 'border-t border-white/10 px-6 sm:px-8 py-5 space-y-3'
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <label className="sr-only" htmlFor="assistant-question">
            Your question
          </label>
          <textarea
            id="assistant-question"
            rows={variant === 'dock' ? 2 : 3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label="Your question"
            placeholder="What are you stuck on?"
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 resize-none"
          />
          <button
            type="submit"
            aria-label="Send question"
            disabled={sending || !input.trim()}
            className="liquid-glass rounded-full p-2.5 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-white/35 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>
              {live
                ? 'The mentors offered are ranked by the matching engine, not chosen by the model.'
                : 'Nothing is stored. Sign in on a running server for answers from your profile.'}
            </span>
          </p>
          <button
            type="button"
            onClick={onBrowseMentors}
            className="text-[10px] text-white/50 hover:text-white shrink-0 cursor-pointer"
          >
            Browse all mentors
          </button>
        </div>
      </div>
    </div>
  );
};
