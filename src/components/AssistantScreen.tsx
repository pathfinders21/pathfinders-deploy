import React from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantChat } from './AssistantChat.tsx';
import type { AssistantMentor } from '../lib/api.ts';
import type { Session } from '../lib/session.ts';

/**
 * `#/assistant`, the assistant as a screen of its own.
 *
 * Same conversation component as the floating dock, with room to read it: a question, a
 * reply, the mentors who fit it, and the questions that would sharpen the next answer.
 * Reachable from the navigation and by deep link, and it works signed out by answering in
 * the browser, which it says on the message itself.
 */

interface Props {
  session: Session;
  onRequestMentor: (mentor: AssistantMentor, topic: string) => void;
  onBrowseMentors: () => void;
}

export const AssistantScreen: React.FC<Props> = ({ session, onRequestMentor, onBrowseMentors }) => {
  const live = session.status === 'ready';

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 max-w-4xl mx-auto text-white">
      <div className="pb-8 border-b border-white/10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs mb-3">
          <Sparkles className="w-3.5 h-3.5 text-white/90" />
          <span>Ask the assistant</span>
        </div>
        <h1
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-4xl sm:text-5xl text-white font-normal"
        >
          Stuck? Describe it.
        </h1>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          One question about the problem in front of you, or about who to talk to. You get the next concrete thing to
          try, and the mentors who fit it, with the reason each one was chosen.
          {live
            ? ' Answers are written from your stored profile, and the mentors are ranked by the matching engine before the model sees them.'
            : ' There is no server answering right now, so the demo engine answers in your browser and nothing is stored.'}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <AssistantChat
          session={session}
          onRequestMentor={onRequestMentor}
          onBrowseMentors={onBrowseMentors}
          variant="page"
        />
      </div>
    </div>
  );
};
