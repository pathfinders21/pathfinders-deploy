import React, { useState } from 'react';
import { Bot, X } from 'lucide-react';
import { AssistantChat } from './AssistantChat.tsx';
import type { AssistantMentor } from '../lib/api.ts';
import type { Session } from '../lib/session.ts';

/**
 * The quick way in: a floating button that opens the chat over whatever screen you are on.
 *
 * The conversation itself lives in `AssistantChat`, which the `#/assistant` screen also
 * uses. This file is only the launcher and the panel around it. The dock hides itself on
 * that screen, so there is never a chat inside a chat.
 */

interface Props {
  session: Session;
  onRequestMentor: (mentor: AssistantMentor, topic: string) => void;
  onBrowseMentors: () => void;
}

export const AssistantDock: React.FC<Props> = ({ session, onRequestMentor, onBrowseMentors }) => {
  const [open, setOpen] = useState(false);
  const live = session.status === 'ready';

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 liquid-glass rounded-full pl-4 pr-5 py-3 text-xs sm:text-sm font-medium text-white flex items-center gap-2 shadow-2xl hover:scale-[1.03] transition-transform cursor-pointer"
        >
          <Bot className="w-4 h-4" />
          <span>Ask the assistant</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Assistant"
          className="fixed bottom-6 right-6 z-40 w-[min(24rem,calc(100vw-3rem))] max-h-[min(38rem,85vh)] flex flex-col rounded-2xl border border-white/10 bg-[#00172e] text-white shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-sm font-medium">The assistant</div>
                <div className="text-[11px] text-white/50">
                  {live ? 'Answers from your stored profile' : 'Answers in this browser, nothing stored'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white p-1 cursor-pointer"
              aria-label="Close the assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <AssistantChat
            session={session}
            onRequestMentor={onRequestMentor}
            onBrowseMentors={onBrowseMentors}
            variant="dock"
          />
        </section>
      )}
    </>
  );
};
