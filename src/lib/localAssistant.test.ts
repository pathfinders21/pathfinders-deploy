/**
 * What the in-browser assistant is allowed to claim.
 *
 * It exists because there is often no server to ask, so these pin the boundaries that
 * keep it honest: it is always labelled the demo engine, the mentors it offers come from
 * the bundled directory by overlap with the question, a mentor with nothing in common is
 * not offered at all, and it never reports a fit score it did not compute.
 */
import { describe, expect, it } from 'vitest';
import { INITIAL_MENTORS } from '../data/mockMentors.ts';
import { localAssistantAnswer, pickMentors, questionWords } from './localAssistant.ts';
import type { Mentor } from '../types.ts';

const mentor = (overrides: Partial<Mentor> & { id: string }): Mentor => ({
  name: 'Dana Reyes',
  role: 'Staff Engineer',
  company: 'Acme',
  avatar: '',
  domain: 'Backend',
  experienceYears: 9,
  rating: 4.8,
  reviewCount: 12,
  bio: 'Works on queues and payments.',
  skills: ['Kafka', 'Postgres'],
  availableSlots: [],
  verification: 'verified',
  ...overrides,
});

const MENTORS: Mentor[] = [
  mentor({ id: 'm-1' }),
  mentor({ id: 'm-2', name: 'Sam Okafor', skills: ['Kubernetes', 'Terraform'], bio: 'Platform work.' }),
  mentor({ id: 'm-3', name: 'Lena Frost', skills: ['Figma'], bio: 'Design systems.' }),
];

describe('matching a question to the bundled directory', () => {
  it('ignores words too short to mean anything, and repeats', () => {
    expect(questionWords('How do I fix the queue, the queue?')).toEqual(['queue']);
  });

  it('offers only mentors whose own words overlap the question', () => {
    const picked = pickMentors('My Kubernetes ingress keeps dropping connections', MENTORS);
    expect(picked.map((entry) => entry.mentor.id)).toEqual(['m-2']);
  });

  it('offers nobody when the question has nothing in common with anyone', () => {
    expect(pickMentors('Baking sourdough at altitude', MENTORS)).toEqual([]);
  });

  it('never offers more than the limit, however many match', () => {
    const picked = pickMentors('Kafka, Postgres, Kubernetes, Terraform and Figma all at once', MENTORS, 2);
    expect(picked).toHaveLength(2);
  });
});

describe('the answer it gives', () => {
  it('is labelled the demo engine and says where the mentors came from', () => {
    const answer = localAssistantAnswer({
      message: 'My Kafka consumer keeps reprocessing the same offset',
      mentors: MENTORS,
      reason: 'offline',
    });

    expect(answer.engine).toBe('demo');
    expect(answer.reply).toMatch(/demo engine/i);
    expect(answer.note).toMatch(/in your browser/i);
    expect(answer.note).toMatch(/keyword overlap/i);
    expect(answer.note).toMatch(/nothing was saved/i);
    expect(answer.ok).toBe(true);
  });

  it('quotes the question back and names the mentor to bring it to', () => {
    const answer = localAssistantAnswer({
      message: 'My Kafka consumer keeps reprocessing the same offset',
      mentors: MENTORS,
      reason: 'offline',
    });

    expect(answer.reply).toContain('Kafka consumer keeps reprocessing');
    expect(answer.reply).toContain('Dana Reyes');
    expect(answer.mentors[0]!.id).toBe('m-1');
    expect(answer.followUps.length).toBeGreaterThan(0);
  });

  it('counts overlap rather than reporting a fit score it never computed', () => {
    const answer = localAssistantAnswer({
      message: 'Kafka queues and Postgres indexes',
      mentors: MENTORS,
      reason: 'offline',
    });
    // Three of those words (Kafka, queues, Postgres) appear in what Dana says about
    // herself. It is a count of shared words, never a fit score.
    expect(answer.mentors[0]!.score).toBe(3);
    expect(answer.mentors[0]!.summary).toMatch(/keyword overlap/i);
  });

  it('says plainly when the reason it is answering is a missing session', () => {
    const signedOut = localAssistantAnswer({ message: 'Where do I start?', mentors: MENTORS, reason: 'signed_out' });
    expect(signedOut.reply).toMatch(/signed-in account/i);

    const offline = localAssistantAnswer({ message: 'Where do I start?', mentors: MENTORS, reason: 'offline' });
    expect(offline.reply).toMatch(/could not be reached/i);
  });

  it('admits when nothing in the directory fits, instead of recommending somebody', () => {
    const answer = localAssistantAnswer({
      message: 'Baking sourdough at altitude',
      mentors: MENTORS,
      reason: 'offline',
    });
    expect(answer.mentors).toEqual([]);
    expect(answer.reply).toMatch(/browse the full directory/i);
  });

  it('only ever offers real people from the directory it was given', () => {
    const answer = localAssistantAnswer({
      message: 'Kubernetes and Terraform and Figma and Kafka',
      mentors: INITIAL_MENTORS,
      reason: 'offline',
    });

    const ids = new Set(INITIAL_MENTORS.map((entry) => entry.id));
    expect(answer.mentors.length).toBeLessThanOrEqual(2);
    for (const offered of answer.mentors) {
      expect(ids.has(offered.id)).toBe(true);
      expect(offered.name.length).toBeGreaterThan(0);
    }
  });
});
