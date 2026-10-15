/**
 * The assistant's answer when no server can write one.
 *
 * Same reason as `localAssessment.ts`: the published build is a static site and this
 * preview has no Worker running, so `/api/assistant/chat` cannot answer. Without this the
 * chat could only report a failure. What it does instead is deliberate and narrow:
 *
 *  - It follows the same shape as the server's deterministic fallback
 *    (`worker/lib/demo.ts` -> `demoAssistant`): restate the question, reduce it to the
 *    next thing to run, and name who to bring it to.
 *  - Mentors come from the bundled directory by keyword overlap with the question. That
 *    is the browser's own rule, not the matching engine's, and the note says so.
 *  - It never claims to be a model, never quotes a score, and saves nothing.
 */
import type { AssistantMentor, AssistantResponse } from './api.ts';
import type { Mentor } from '../types.ts';

export type LocalAssistantReason = 'offline' | 'signed_out';

export type LocalAssistantInput = {
  message: string
  mentors: Mentor[]
  reason: LocalAssistantReason
  /** Only known when the browser holds a profile, which it never does on its own. */
  goalTitle?: string | null
  skillsWant?: string[]
  limit?: number
}

/** Words worth matching on: four characters or more, lowercased, deduplicated. */
export function questionWords(message: string): string[] {
  const seen = new Set<string>();
  for (const raw of message.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const word = raw.replace(/^[.]+|[.]+$/g, '');
    if (word.length >= 4) seen.add(word);
  }
  return [...seen];
}

/**
 * The mentors the bundled directory says fit the question.
 *
 * One point per distinct question word that appears in what they say about themselves,
 * then the better reviewed profile wins a tie. A mentor with no overlap is not offered:
 * a chat that always recommends somebody is not finding anybody.
 */
export function pickMentors(
  message: string,
  mentors: Mentor[],
  limit = 2,
): Array<{ mentor: Mentor; score: number }> {
  const words = questionWords(message);
  return mentors
    .map((mentor) => {
      const haystack = [mentor.skills, mentor.domain, mentor.role, mentor.company, mentor.bio]
        .flat()
        .join(' ')
        .toLowerCase();
      const score = words.reduce((total, word) => (haystack.includes(word) ? total + 1 : total), 0);
      return { mentor, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.mentor.rating - a.mentor.rating)
    .slice(0, limit);
}

function toAssistantMentor(mentor: Mentor, score: number): AssistantMentor {
  return {
    id: mentor.id,
    name: mentor.name,
    headline: [mentor.role, mentor.company].filter(Boolean).join(' at '),
    expertise: mentor.skills,
    // Not the matching engine's number, so it is reported as overlap, not as fit.
    score,
    summary: `Works on ${mentor.skills.slice(0, 3).join(', ') || mentor.domain}. Chosen here by keyword overlap with your question.`,
  };
}

export function localAssistantAnswer(input: LocalAssistantInput): AssistantResponse {
  const asked = input.message.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '');
  const short = asked.length > 140 ? `${asked.slice(0, 137)}...` : asked;
  const picked = pickMentors(input.message, input.mentors, input.limit ?? 2);
  const next = input.skillsWant?.[0] ?? null;

  const why = input.reason === 'signed_out'
    ? 'This is the demo engine answering in your browser, because a written answer needs a signed-in account on a running server.'
    : 'This is the demo engine answering in your browser, because the server that writes a real answer could not be reached.';

  const paragraphs = [
    `You asked: "${short}". ${why} Treat it as a way to organise the question rather than an answer about your code.`,
    input.goalTitle
      ? `Against your stored goal ("${input.goalTitle}") the shortest path is one thing you can run today${next ? `, which for you is ${next}` : ''}: write down what you expect first, run it, and keep the output, so one round with a mentor replaces three.`
      : 'No goal is stored in this browser, so the same question has several right answers depending on where you are trying to get to. Name the direction first, then ask again.',
    picked.length
      ? `Who to ask: ${picked.map((entry) => `${entry.mentor.name} (${entry.mentor.skills.slice(0, 3).join(', ') || entry.mentor.domain})`).join(', or ')}. Bring the smallest reproduction, what you already tried, and the output you got.`
      : 'Nothing in the bundled directory matches those words closely, so say a little more about the field and the stack, or browse the full directory.',
  ];

  return {
    ok: true,
    reply: paragraphs.join('\n\n'),
    followUps: [
      'What is the smallest command or request that reproduces this?',
      'What have you already tried?',
      'What would a good result look like, specifically?',
    ],
    mentors: picked.map((entry) => toAssistantMentor(entry.mentor, entry.score)),
    engine: 'demo',
    cached: false,
    considered: input.mentors.length,
    note: 'Computed by the deterministic demo engine in your browser. The mentors were chosen by keyword overlap against the bundled directory rather than by the matching engine, and nothing was saved.',
  };
}
